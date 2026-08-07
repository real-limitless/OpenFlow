import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest, withPairedItem } from "@/sdk";

const BASE_URL = "https://www.strava.com/api/v3";

const SPORT_TYPES = [
  "AlpineSki", "BackcountrySki", "Badminton", "Canoeing", "Crossfit",
  "EBikeRide", "Elliptical", "EMountainBikeRide", "Golf", "GravelRide",
  "Handcycle", "HighIntensityIntervalTraining", "Hike", "IceSkate",
  "InlineSkate", "Kayaking", "Kitesurf", "MountainBikeRide", "NordicSki",
  "Pickleball", "Pilates", "Racquetball", "Ride", "RockClimbing",
  "RollerSki", "Rowing", "Run", "Sail", "Skateboard", "Snowboard",
  "Snowshoe", "Soccer", "Squash", "StairStepper", "StandUpPaddling",
  "Surfing", "Swim", "TableTennis", "Tennis", "TrailRun", "Velomobile",
  "VirtualRide", "VirtualRow", "VirtualRun", "Walk", "WeightTraining",
  "Wheelchair", "Windsurf", "Workout", "Yoga",
];

const STREAM_KEYS = [
  "altitude", "cadence", "distance", "grade_smooth", "heartrate",
  "latlng", "moving", "temp", "time", "velocity_smooth", "watts",
];

interface StravaCredential {
  accessToken?: string;
  access_token?: string;
}

async function getAuthToken(ctx: Parameters<NodeExecutor>[0]): Promise<string> {
  const cred = (await ctx.getCredential("stravaOAuth2Api")) as StravaCredential | null;
  if (!cred) {
    throw new Error("Credential \"stravaOAuth2Api\" is not configured on this node");
  }
  return cred.accessToken ?? cred.access_token ?? "";
}

type OperationHandler = (
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  token: string,
) => Promise<unknown>;

function getParam<T>(ctx: Parameters<NodeExecutor>[0], name: string, fallback?: T): T {
  return ctx.getParam<T>(name, fallback as T);
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      out[k] = obj[k];
    }
  }
  return out;
}

const handlers: Record<string, OperationHandler> = {
  async create(ctx, _item, token) {
    const name = getParam<string>(ctx, "name", "");
    const sportType = getParam<string>(ctx, "sport_type", "");
    const type = getParam<string>(ctx, "type", "");
    const startDate = getParam<string>(ctx, "startDate", "");
    const elapsedTime = getParam<number>(ctx, "elapsedTime", 0);

    if (!name) throw new Error("Missing required parameter: name");
    if (!startDate) throw new Error("Missing required parameter: startDate");
    if (!elapsedTime) throw new Error("Missing required parameter: elapsedTime");

    const body: Record<string, unknown> = {
      name,
      start_date_local: startDate,
      elapsed_time: elapsedTime,
    };
    if (sportType) body.sport_type = sportType;
    if (type) body.type = type;

    const additionalFields = getParam<Record<string, unknown>>(ctx, "additionalFields", {}) ?? {};
    if (additionalFields.commute !== undefined) body.commute = additionalFields.commute;
    if (additionalFields.description) body.description = additionalFields.description;
    if (additionalFields.distance !== undefined) body.distance = additionalFields.distance;
    if (additionalFields.trainer !== undefined) body.trainer = additionalFields.trainer;

    const res = await sdkHttpRequest({
      method: "POST",
      url: `${BASE_URL}/activities`,
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    return res.body;
  },

  async get(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getAll(ctx, _item, token) {
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const filters = getParam<Record<string, unknown>>(ctx, "filters", {}) ?? {};

    const params = new URLSearchParams();
    if (!returnAll && limit > 0) params.set("per_page", String(limit));
    if (filters.before) params.set("before", String(filters.before));
    if (filters.after) params.set("after", String(filters.after));

    const qs = params.toString();
    const url = `${BASE_URL}/athlete/activities${qs ? `?${qs}` : ""}`;
    const res = await sdkHttpRequest({
      method: "GET",
      url,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getComments(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const params = new URLSearchParams();
    if (!returnAll && limit > 0) params.set("per_page", String(Math.min(limit, 100)));
    const qs = params.toString();
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}/comments${qs ? `?${qs}` : ""}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getKudos(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const returnAll = getParam<boolean>(ctx, "returnAll", false);
    const limit = getParam<number>(ctx, "limit", 50);
    const params = new URLSearchParams();
    if (!returnAll && limit > 0) params.set("per_page", String(Math.min(limit, 100)));
    const qs = params.toString();
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}/kudos${qs ? `?${qs}` : ""}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getLaps(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}/laps`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getStreams(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const keys = getParam<string[]>(ctx, "keys", []);
    if (!keys || keys.length === 0) throw new Error("Missing required parameter: keys");

    const params = new URLSearchParams();
    params.set("keys", keys.join(","));
    params.set("key_by_type", "true");
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}/streams?${params.toString()}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async getZones(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${BASE_URL}/activities/${activityId}/zones`,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.body;
  },

  async update(ctx, _item, token) {
    const activityId = getParam<string>(ctx, "activityId", "");
    if (!activityId) throw new Error("Missing required parameter: activityId");
    const updateFields = getParam<Record<string, unknown>>(ctx, "updateFields", {}) ?? {};
    const body = pick(updateFields, [
      "name", "description", "type", "sport_type", "commute",
      "trainer", "gear_id", "hide_from_home",
    ]);
    const res = await sdkHttpRequest({
      method: "PUT",
      url: `${BASE_URL}/activities/${activityId}`,
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    return res.body;
  },
};

export const stravaToolExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) return [[]];

  const operation = getParam<string>(ctx, "operation", "");
  const token = await getAuthToken(ctx);

  const handler = handlers[operation];
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`);
  }

  const results = await Promise.all(
    items.map(async (item, idx) => {
      try {
        const data = await handler(ctx, item, token);
        return { json: data as Record<string, unknown>, pairedItem: { item: idx, input: 0 } };
      } catch (e) {
        if (ctx.continueOnFail()) {
          return { json: { error: (e as Error).message }, pairedItem: { item: idx, input: 0 } };
        }
        throw e;
      }
    }),
  );

  return [results];
};
