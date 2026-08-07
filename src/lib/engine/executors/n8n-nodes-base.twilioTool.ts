import type { NodeExecutor } from "@/sdk";

const API_BASE = "https://api.twilio.com/2010-04-01/Accounts";

function basicAuthHeader(accountSid: string, authToken: string): string {
  return "Basic " + btoa(`${accountSid}:${authToken}`);
}

async function twilioRequest(
  accountSid: string,
  authToken: string,
  method: string,
  path: string,
  form?: Record<string, string>,
): Promise<unknown> {
  const url = `${API_BASE}/${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const init: RequestInit = {
      method,
      headers: { Authorization: basicAuthHeader(accountSid, authToken) },
      signal: controller.signal,
    };
    if (form && method !== "GET" && method !== "DELETE") {
      init.headers = { ...init.headers, "Content-Type": "application/x-www-form-urlencoded" };
      init.body = new URLSearchParams(form).toString();
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (response.status < 200 || response.status >= 300) {
      const obj = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        ? parsed as Record<string, unknown>
        : { message: `HTTP ${response.status}` };
      const errMsg = String((obj as Record<string, unknown>).message ?? `HTTP ${response.status}`);
      throw new Error(errMsg);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function asObj(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return { data: body };
}

export const twilioToolExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "sms");
  const operation = ctx.getParam<string>("operation", "send");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("twilioApi");
  const accountSid = cred ? String(cred.accountSid ?? "") : "";
  const authToken = cred ? String(cred.authToken ?? "") : "";
  if (!accountSid || !authToken) {
    throw new Error("Twilio Tool: twilioApi credential is not configured");
  }

  const out: Array<{ json: Record<string, unknown>; pairedItem: unknown }> = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      if (resource === "sms" && operation === "send") {
        const from = ctx.getParam<string>("from", "");
        const to = ctx.getParam<string>("to", "");
        const body = ctx.getParam<string>("body", "");
        if (!from) throw new Error("Twilio Tool: from is required");
        if (!to) throw new Error("Twilio Tool: to is required");
        if (!body) throw new Error("Twilio Tool: body is required");

        const form: Record<string, string> = { To: to, From: from, Body: body };

        const mediaUrls = ctx.getParam<string[] | string>("mediaUrls", []);
        const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
        for (const url of urls) {
          if (url) form.MediaUrl = url;
        }

        const res = await twilioRequest(accountSid, authToken, "POST", `${accountSid}/Messages.json`, form);
        out.push({ json: asObj(res) as Record<string, unknown>, pairedItem });
      } else if (resource === "call" && operation === "make") {
        const from = ctx.getParam<string>("from", "");
        const to = ctx.getParam<string>("to", "");
        if (!from) throw new Error("Twilio Tool: from is required");
        if (!to) throw new Error("Twilio Tool: to is required");

        const twiml = ctx.getParam<string>("twiml", "");
        const url = ctx.getParam<string>("url", "");
        if (!twiml && !url) {
          throw new Error("Twilio Tool: either twiml or url must be provided");
        }

        const form: Record<string, string> = { To: to, From: from };
        if (twiml) form.Twiml = twiml;
        if (url) form.Url = url;

        const sendDigits = ctx.getParam<string>("sendDigits", "");
        if (sendDigits) form.SendDigits = sendDigits;

        const timeout = ctx.getParam<number>("timeout", 60);
        if (timeout !== undefined) form.Timeout = String(timeout);

        const record = ctx.getParam<boolean>("record", false);
        if (record) form.Record = "true";

        const recordingChannels = ctx.getParam<string>("recordingChannels", "");
        if (recordingChannels) form.RecordingChannels = recordingChannels;

        const machineDetection = ctx.getParam<string>("machineDetection", "");
        if (machineDetection) form.MachineDetection = machineDetection;

        const statusCallback = ctx.getParam<string>("statusCallback", "");
        if (statusCallback) form.StatusCallback = statusCallback;

        const statusCallbackEvent = ctx.getParam<string[] | string>("statusCallbackEvent", []);
        const events = Array.isArray(statusCallbackEvent) ? statusCallbackEvent : [statusCallbackEvent];
        if (events.length > 0 && events[0]) form.StatusCallbackEvent = events.join(",");

        const trim = ctx.getParam<string>("trim", "");
        if (trim) form.Trim = trim;

        const res = await twilioRequest(accountSid, authToken, "POST", `${accountSid}/Calls.json`, form);
        out.push({ json: asObj(res) as Record<string, unknown>, pairedItem });
      } else {
        throw new Error(`Twilio Tool: unsupported resource "${resource}" / operation "${operation}"`);
      }
    } catch (err) {
      if (!continueOnFail) throw err;
      const message = err instanceof Error ? err.message : String(err);
      out.push({ json: { error: message }, pairedItem });
    }
  }

  return [out];
};
