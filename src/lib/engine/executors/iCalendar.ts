import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import crypto from "node:crypto";

function formatIcsDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function formatIcsDateAllDay(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function generateUid(): string {
  return `${Date.now()}-${crypto.randomUUID()}@openflow`;
}

function getAdditionalField<T>(
  additionalFields: Record<string, unknown> | undefined,
  name: string,
  defaultValue: T,
): T {
  if (!additionalFields) return defaultValue;
  return (additionalFields[name] as T) ?? defaultValue;
}

export const iCalendarExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "createEventFile");
  if (operation !== "createEventFile") {
    throw new Error(`iCalendar: unknown operation "${operation}"`);
  }

  const continueOnFail = ctx.continueOnFail();
  const outputItems: INodeExecutionData[] = [];

  for (let i = 0; i < inputItems.length; i++) {
    try {
      const title = ctx.getParam<string>("title", "");
      const startRaw = ctx.getParam<string>("start", "");
      const endRaw = ctx.getParam<string>("end", "");
      const allDay = ctx.getParam<boolean>("allDay", false);
      const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
      const additionalFields = ctx.getParam<Record<string, unknown>>("additionalFields", {});

      if (!startRaw) {
        throw new Error("iCalendar: 'start' parameter is required");
      }

      const end = endRaw || startRaw;
      const fileName = getAdditionalField<string>(additionalFields, "fileName", "event.ics");

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//OpenFlow//iCalendar//EN",
        "BEGIN:VEVENT",
      ];

      const uid = getAdditionalField<string>(additionalFields, "uid", "") || generateUid();
      lines.push(`UID:${uid}`);

      const dtStamp = formatIcsDate(new Date().toISOString());
      if (dtStamp) lines.push(`DTSTAMP:${dtStamp}`);

      if (allDay) {
        lines.push(`DTSTART;VALUE=DATE:${formatIcsDateAllDay(startRaw)}`);
        lines.push(`DTEND;VALUE=DATE:${formatIcsDateAllDay(end)}`);
      } else {
        const dtStart = formatIcsDate(startRaw);
        if (!dtStart) throw new Error("iCalendar: invalid start date");
        lines.push(`DTSTART:${dtStart}`);
        const dtEnd = formatIcsDate(end);
        if (dtEnd) lines.push(`DTEND:${dtEnd}`);
      }

      if (title) {
        lines.push(`SUMMARY:${escapeIcs(title)}`);
      }

      const description = getAdditionalField<string>(additionalFields, "description", "");
      if (description) {
        lines.push(`DESCRIPTION:${escapeIcs(description)}`);
      }

      const location = getAdditionalField<string>(additionalFields, "location", "");
      if (location) {
        lines.push(`LOCATION:${escapeIcs(location)}`);
      }

      const calName = getAdditionalField<string>(additionalFields, "calName", "");
      if (calName) {
        lines.push(`X-WR-CALNAME:${escapeIcs(calName)}`);
      }

      const status = getAdditionalField<string>(additionalFields, "status", "CONFIRMED");
      if (status) {
        lines.push(`STATUS:${status}`);
      }

      const urlVal = getAdditionalField<string>(additionalFields, "url", "");
      if (urlVal) {
        lines.push(`URL:${escapeIcs(urlVal)}`);
      }

      const sequence = getAdditionalField<number>(additionalFields, "sequence", 0);
      lines.push(`SEQUENCE:${sequence}`);

      const recurrenceRule = getAdditionalField<string>(additionalFields, "recurrenceRule", "");
      if (recurrenceRule) {
        lines.push(`RRULE:${recurrenceRule}`);
      }

      const busyStatus = getAdditionalField<string>(additionalFields, "busyStatus", "");
      if (busyStatus) {
        lines.push(`X-MICROSOFT-CDO-BUSYSTATUS:${busyStatus}`);
      }

      const geolocation = getAdditionalField<Record<string, unknown>>(
        additionalFields,
        "geolocation",
        {},
      );
      const geoValues = (geolocation?.geolocationValues as Record<string, unknown>) ?? {};
      const latitude = geoValues?.latitude as string | undefined;
      const longitude = geoValues?.longitude as string | undefined;
      if (latitude && longitude) {
        lines.push(`GEO:${latitude};${longitude}`);
      }

      const organizer = getAdditionalField<Record<string, unknown>>(
        additionalFields,
        "organizer",
        {},
      );
      const orgValues = (organizer?.organizerValues as Record<string, unknown>) ?? {};
      const orgName = orgValues?.name as string | undefined;
      const orgEmail = orgValues?.email as string | undefined;
      if (orgEmail) {
        const orgPart = orgName ? `CN=${escapeIcs(orgName)}:mailto:${orgEmail}` : `mailto:${orgEmail}`;
        lines.push(`ORGANIZER;${orgPart}`);
      }

      const attendees = getAdditionalField<Record<string, unknown>>(
        additionalFields,
        "attendeesUi",
        {},
      );
      const attendeeList = (attendees?.attendeeValues as Array<Record<string, unknown>>) ?? [];
      for (const att of attendeeList) {
        const attName = att?.name as string | undefined;
        const attEmail = att?.email as string | undefined;
        const attRsvp = att?.rsvp as boolean | undefined;
        if (attEmail) {
          const parts: string[] = [];
          if (attName) parts.push(`CN=${escapeIcs(attName)}`);
          parts.push(`mailto:${attEmail}`);
          if (attRsvp) parts.push("RSVP=TRUE");
          lines.push(`ATTENDEE;${parts.join(";")}`);
        }
      }

      lines.push("END:VEVENT", "END:VCALENDAR");

      const icsContent = lines.join("\r\n") + "\r\n";
      const buf = Buffer.from(icsContent, "utf8");

      const ext = fileName.includes(".") ? fileName.split(".").pop()! : "ics";
      const baseName = fileName.includes(".") ? fileName.slice(0, fileName.lastIndexOf(".")) : "event";

      const binary: Record<string, IBinaryData> = {
        [binaryPropertyName]: {
          data: buf.toString("base64"),
          mimeType: "text/calendar",
          fileName: fileName,
          fileExtension: ext,
          fileSize: buf.length,
        },
      };

      outputItems.push({
        json: {},
        binary,
        pairedItem: { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        outputItems.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: { item: i, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [outputItems];
};