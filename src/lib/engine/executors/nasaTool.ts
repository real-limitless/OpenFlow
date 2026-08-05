import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const NASA_API_BASE = "https://api.nasa.gov";

function buildApiUrl(
  resource: string,
  apiKey: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const basePaths: Record<string, string> = {
    astronomyPictureOfTheDay: "/planetary/apod",
    asteroidNeoFeed: "/neo/rest/v1/feed",
    asteroidNeoLookup: "/neo/rest/v1/neo",
    asteroidNeoBrowse: "/neo/rest/v1/neo/browse",
    donkiCoronalMassEjection: "/DONKI/CME",
    donkiGeomagneticStorm: "/DONKI/GST",
    donkiHighSpeedStream: "/DONKI/HSS",
    donkiInterplanetaryShock: "/DONKI/IPS",
    donkiMagnetopauseCrossing: "/DONKI/MPC",
    donkiNotifications: "/DONKI/notifications",
    donkiRadiationBeltEnhancement: "/DONKI/RBE",
    donkiSolarEnergeticParticle: "/DONKI/SEP",
    donkiSolarFlare: "/DONKI/FLR",
    donkiWsaEnlilSimulation: "/DONKI/WSAEnlilSimulations",
    earthImagery: "/planetary/earth/imagery",
    earthAssets: "/planetary/earth/assets",
    inSightMarsWeatherService: "/insight_weather",
    imageAndVideoLibrary: "/planetary/apod",
    techTransfer: "/techtransfer/patent",
    twoLineElementSet: "/planetary/apod",
  };

  let path = basePaths[resource];
  if (!path) throw new Error(`NASA Tool: unsupported resource "${resource}"`);

  if (resource === "asteroidNeoLookup") {
    const asteroidId = String(params.asteroidId ?? "");
    if (!asteroidId) throw new Error("NASA Tool: asteroidId is required for asteroidNeoLookup");
    path = `${path}/${encodeURIComponent(asteroidId)}`;
  }

  const query = new URLSearchParams();
  query.set("api_key", apiKey);

  switch (resource) {
    case "astronomyPictureOfTheDay":
      if (params.date) query.set("date", String(params.date));
      break;
    case "asteroidNeoFeed":
      if (params.startDate) query.set("start_date", String(params.startDate));
      if (params.endDate) query.set("end_date", String(params.endDate));
      break;
    case "asteroidNeoBrowse":
      if (params.returnAll !== true) {
        const limit = Number(params.limit) || 20;
        query.set("size", String(limit));
      }
      break;
    case "earthImagery":
    case "earthAssets":
      if (params.lat !== undefined) query.set("lat", String(params.lat));
      if (params.lon !== undefined) query.set("lon", String(params.lon));
      if (params.dim !== undefined) query.set("dim", String(params.dim));
      if (params.date) query.set("date", String(params.date));
      break;
    case "inSightMarsWeatherService":
      query.set("feedtype", "json");
      query.set("ver", "1.0");
      break;
    case "donkiCoronalMassEjection":
    case "donkiGeomagneticStorm":
    case "donkiHighSpeedStream":
    case "donkiMagnetopauseCrossing":
    case "donkiNotifications":
    case "donkiRadiationBeltEnhancement":
    case "donkiSolarEnergeticParticle":
    case "donkiSolarFlare":
    case "donkiWsaEnlilSimulation":
      if (params.startDate) query.set("startDate", String(params.startDate));
      if (params.endDate) query.set("endDate", String(params.endDate));
      break;
    case "donkiInterplanetaryShock":
      if (params.startDate) query.set("startDate", String(params.startDate));
      if (params.endDate) query.set("endDate", String(params.endDate));
      if (params.location && params.location !== "ALL") query.set("location", String(params.location));
      if (params.catalog && params.catalog !== "ALL") query.set("catalog", String(params.catalog));
      break;
    case "asteroidNeoLookup":
      if (params.includeCloseApproachData === true) {
        query.set("include_close_approach_data", "true");
      }
      break;
    case "imageAndVideoLibrary":
      if (params.q) query.set("q", String(params.q));
      break;
    case "techTransfer":
      query.set("api_key", apiKey);
      break;
  }

  const qs = query.toString();
  return `${NASA_API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

export const nasaToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "astronomyPictureOfTheDay");
  const continueOnFail = ctx.continueOnFail();

  const credential = await ctx.getCredential("nasaApi");
  const apiKey = credential ? String(credential.apiKey ?? credential.api_key ?? "") : "";
  if (!apiKey) throw new Error("NASA Tool: nasaApi credential is not configured");

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const params = ctx.getParams();
      const additionalFields = (params.additionalFields ?? {}) as Record<string, unknown>;

      const queryParams: Record<string, string | number | boolean | undefined> = {
        asteroidId: params.asteroidId as string | undefined,
        returnAll: params.returnAll as boolean | undefined,
        limit: params.limit as number | undefined,
        q: params.q as string | undefined,
      };
      for (const [k, v] of Object.entries(additionalFields)) {
        queryParams[k] = v as string | number | boolean | undefined;
      }

      const url = buildApiUrl(resource, apiKey, queryParams);

      const response = await fetch(url, { headers: { accept: "application/json" } });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`NASA API: HTTP ${response.status} ${text || response.statusText}`.trim());
      }

      const body = await response.json();

      if (resource === "asteroidNeoBrowse" && params.returnAll !== true) {
        const limit = Number(params.limit) || 20;
        const bodyRecord = body as Record<string, unknown>;
        const nearEarthObjects = bodyRecord.near_earth_objects;
        if (Array.isArray(nearEarthObjects) && nearEarthObjects.length > limit) {
          bodyRecord.near_earth_objects = nearEarthObjects.slice(0, limit);
        }
      }

      out.push({
        json: body as Record<string, unknown>,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
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
