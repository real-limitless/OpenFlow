import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

interface NasaResult {
  json: Record<string, unknown>;
  binary?: INodeExecutionData["binary"];
}

const NASA_API = "https://api.nasa.gov";

export const nasaExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "astronomyPictureOfTheDay");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "nasaApi");
  const apiKey = (cred as Record<string, string>)?.apiKey;
  if (!apiKey) {
    throw new Error("NASA: API key is missing from credential");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const { json, binary } = await fetchNasaApi(resource, ctx, apiKey);
      const entry: INodeExecutionData = {
        json,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      };
      if (binary) entry.binary = binary;
      out.push(entry);
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function fetchNasaApi(
  resource: string,
  ctx: Parameters<NodeExecutor>[0],
  apiKey: string,
): Promise<NasaResult> {
  const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});

  switch (resource) {
    case "astronomyPictureOfTheDay": {
      const params = new URLSearchParams({ api_key: apiKey });
      const date = (additionalFields.date as string) ?? "";
      if (date) params.set("date", date);
      const data = (await nasaFetch("/planetary/apod", params)) as Record<string, unknown>;
      const download = ctx.getParam<boolean>("download", false);
      if (download) {
        const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
        const imageUrl = (data.hdurl as string) || (data.url as string);
        if (imageUrl && typeof imageUrl === "string") {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const imgBuffer = await imgRes.arrayBuffer();
            return {
              json: data,
              binary: {
                [binaryPropertyName]: {
                  data: Buffer.from(imgBuffer).toString("base64"),
                  mimeType: imgRes.headers.get("content-type") || "image/jpeg",
                  fileName: imageUrl.split("/").pop() || "image.jpg",
                },
              },
            };
          }
        }
      }
      return { json: data };
    }

    case "asteroidNeoFeed": {
      const params = new URLSearchParams({ api_key: apiKey });
      const startDate = (additionalFields.startDate as string) ?? "";
      const endDate = (additionalFields.endDate as string) ?? "";
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const data = await nasaFetch("/neo/rest/1/feed", params);
      return { json: data as Record<string, unknown> };
    }

    case "asteroidNeoLookup": {
      const asteroidId = ctx.getParam<string>("asteroidId", "");
      if (!asteroidId) {
        throw new Error("NASA: asteroidId is required for asteroidNeoLookup");
      }
      const params = new URLSearchParams({ api_key: apiKey });
      const includeCAD = additionalFields.includeCloseApproachData as boolean;
      if (includeCAD) params.set("include_close_approach_data", "true");
      const data = await nasaFetch(`/neo/rest/1/neo/${encodeURIComponent(asteroidId)}`, params);
      return { json: data as Record<string, unknown> };
    }

    case "asteroidNeoBrowse": {
      const params = new URLSearchParams({ api_key: apiKey });
      const returnAll = ctx.getParam<boolean>("returnAll", false);
      const limit = ctx.getParam<number>("limit", 20);
      const pageSize = returnAll ? 20 : limit;
      params.set("size", String(pageSize));
      let data = (await nasaFetch("/neo/rest/1/neo/browse", params)) as Record<string, unknown>;
      if (returnAll) {
        const allNeos: unknown[] = [...((data.near_earth_objects as unknown[]) || [])];
        let pageUrl = (data.links as Record<string, unknown>)?.next as string | undefined;
        while (pageUrl) {
          const pageRes = await fetch(pageUrl, { headers: { accept: "application/json" } });
          if (!pageRes.ok) break;
          const pageData = (await pageRes.json()) as Record<string, unknown>;
          allNeos.push(...((pageData.near_earth_objects as unknown[]) || []));
          pageUrl = (pageData.links as Record<string, unknown>)?.next as string | undefined;
        }
        data = { ...data, near_earth_objects: allNeos };
      }
      return { json: data };
    }

    case "donkiCoronalMassEjection": {
      return donkiFetch("CME", apiKey, additionalFields);
    }
    case "donkiGeomagneticStorm": {
      return donkiFetch("GST", apiKey, additionalFields);
    }
    case "donkiHighSpeedStream": {
      return donkiFetch("HSS", apiKey, additionalFields);
    }
    case "donkiInterplanetaryShock": {
      return donkiFetch("IPS", apiKey, additionalFields, additionalFields.location as string, additionalFields.catalog as string);
    }
    case "donkiMagnetopauseCrossing": {
      return donkiFetch("MPC", apiKey, additionalFields);
    }
    case "donkiNotifications": {
      return donkiFetch("notifications", apiKey, additionalFields);
    }
    case "donkiRadiationBeltEnhancement": {
      return donkiFetch("RBE", apiKey, additionalFields);
    }
    case "donkiSolarEnergeticParticle": {
      return donkiFetch("SEP", apiKey, additionalFields);
    }
    case "donkiSolarFlare": {
      return donkiFetch("FLR", apiKey, additionalFields);
    }
    case "donkiWsaEnlilSimulation": {
      return donkiFetch("WSAEnlilSimulations", apiKey, additionalFields);
    }

    case "earthImagery": {
      const lat = ctx.getParam<number>("lat", 0);
      const lon = ctx.getParam<number>("lon", 0);
      const params = new URLSearchParams({ api_key: apiKey, lat: String(lat), lon: String(lon) });
      const date = (additionalFields.date as string) ?? "";
      if (date) params.set("date", date);
      const dim = additionalFields.dim as number;
      if (dim) params.set("dim", String(dim));
      const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
      const url = `${NASA_API}/planetary/earth/imagery?${params.toString()}`;
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        const body = await imgRes.text().catch(() => "");
        throw new Error(`NASA API: HTTP ${imgRes.status}${body ? ` - ${body}` : ""}`);
      }
      const imgBuffer = await imgRes.arrayBuffer();
      return {
        json: {},
        binary: {
          [binaryPropertyName]: {
            data: Buffer.from(imgBuffer).toString("base64"),
            mimeType: imgRes.headers.get("content-type") || "image/png",
            fileName: `earth_${lat}_${lon}.png`,
          },
        },
      };
    }

    case "earthAssets": {
      const lat = ctx.getParam<number>("lat", 0);
      const lon = ctx.getParam<number>("lon", 0);
      const params = new URLSearchParams({ api_key: apiKey, lat: String(lat), lon: String(lon) });
      const date = (additionalFields.date as string) ?? "";
      if (date) params.set("date", date);
      const dim = additionalFields.dim as number;
      if (dim) params.set("dim", String(dim));
      const data = await nasaFetch("/planetary/earth/assets", params);
      return { json: data as Record<string, unknown> };
    }

    case "inSightMarsWeatherService": {
      const params = new URLSearchParams({ api_key: apiKey, feedtype: "json", ver: "1.0" });
      const data = await nasaFetch("/insight_weather", params);
      return { json: data as Record<string, unknown> };
    }

    case "imageAndVideoLibrary": {
      const params = new URLSearchParams();
      const q = ctx.getParam<string>("q", "");
      if (q) params.set("q", q);
      const res = await fetch(`https://images-api.nasa.gov/search?${params.toString()}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`NASA Media API: HTTP ${res.status}${body ? ` - ${body}` : ""}`);
      }
      return { json: (await res.json()) as Record<string, unknown> };
    }

    case "techTransfer": {
      const data = await nasaFetch("/techtransfer/patent", new URLSearchParams({ api_key: apiKey }));
      return { json: data as Record<string, unknown> };
    }

    case "twoLineElementSet": {
      const res = await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json", {
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`TLE API: HTTP ${res.status}${body ? ` - ${body}` : ""}`);
      }
      return { json: (await res.json()) as Record<string, unknown> };
    }

    default:
      throw new Error(`NASA: unknown resource "${resource}"`);
  }
}

async function nasaFetch(path: string, params: URLSearchParams): Promise<unknown> {
  const url = `${NASA_API}${path}?${params.toString()}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NASA API: HTTP ${res.status}${body ? ` - ${body}` : ""}`);
  }
  return res.json();
}

async function donkiFetch(
  type: string,
  apiKey: string,
  additionalFields: Record<string, unknown>,
  location?: string,
  catalog?: string,
): Promise<NasaResult> {
  const params = new URLSearchParams({ api_key: apiKey });
  const startDate = (additionalFields.startDate as string) ?? "";
  const endDate = (additionalFields.endDate as string) ?? "";
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (location && location !== "ALL") params.set("location", location);
  if (catalog && catalog !== "ALL") params.set("catalog", catalog);
  const data = await nasaFetch(`/DONKI/${type}`, params);
  return { json: data as Record<string, unknown> };
}
