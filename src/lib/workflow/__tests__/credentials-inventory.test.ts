import { describe, it, expect } from "vitest";
import {
  applyCredentialMappings,
  collectWorkflowCredentials,
} from "../credentials-inventory";
import type { IWorkflow } from "../types";
import type { CredentialMeta } from "../../credentials/types";
import { buildCredentialData, getCredentialTypeDef } from "../../credentials/types";

const baseWorkflow = (): IWorkflow => ({
  id: "wf1",
  name: "Test",
  active: false,
  settings: {},
  connections: {},
  nodes: [
    {
      id: "1",
      name: "FTP",
      type: "n8n-nodes-base.ftp",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      credentials: { ftp: { id: "foreign-id", name: "FTP account" } },
    },
    {
      id: "2",
      name: "Mail",
      type: "n8n-nodes-base.emailSend",
      typeVersion: 1,
      position: [200, 0],
      parameters: {},
      credentials: { smtp: { id: "smtp-x", name: "SMTP account" } },
    },
    {
      id: "3",
      name: "NoCred",
      type: "n8n-nodes-base.set",
      typeVersion: 1,
      position: [400, 0],
      parameters: {},
    },
  ],
});

describe("credentials inventory", () => {
  it("collects unique slots from node refs and marks unmapped", () => {
    const inv = collectWorkflowCredentials(baseWorkflow(), []);
    expect(inv.missingCount).toBeGreaterThanOrEqual(2);
    const types = inv.slots.map((s) => s.type);
    expect(types).toContain("ftp");
    expect(types).toContain("smtp");
    expect(inv.slots.find((s) => s.type === "ftp")?.status).toBe("unmapped");
  });

  it("marks ok when local id matches", () => {
    const locals: CredentialMeta[] = [
      { id: "foreign-id", name: "FTP account", type: "ftp", createdAt: "" },
    ];
    const inv = collectWorkflowCredentials(baseWorkflow(), locals);
    const ftp = inv.slots.find((s) => s.type === "ftp");
    expect(ftp?.status).toBe("ok");
    expect(ftp?.local?.id).toBe("foreign-id");
  });

  it("marks ok when local name+type matches", () => {
    const locals: CredentialMeta[] = [
      { id: "local-1", name: "FTP account", type: "ftp", createdAt: "" },
    ];
    const inv = collectWorkflowCredentials(baseWorkflow(), locals);
    expect(inv.slots.find((s) => s.type === "ftp")?.status).toBe("ok");
  });

  it("applyCredentialMappings rewrites node refs", () => {
    const wf = baseWorkflow();
    const inv = collectWorkflowCredentials(wf, []);
    const ftpSlot = inv.slots.find((s) => s.type === "ftp")!;
    const mapped = applyCredentialMappings(wf, inv, {
      [ftpSlot.key]: {
        id: "new-ftp",
        name: "My FTP",
        type: "ftp",
        createdAt: "",
      },
    });
    expect(mapped.nodes.find((n) => n.name === "FTP")?.credentials?.ftp).toEqual({
      id: "new-ftp",
      name: "My FTP",
    });
    // unmapped smtp left alone
    expect(mapped.nodes.find((n) => n.name === "Mail")?.credentials?.smtp?.id).toBe("smtp-x");
  });
});

describe("credential field catalog", () => {
  it("has ftp/smtp/openAi field defs", () => {
    expect(getCredentialTypeDef("ftp").fields.some((f) => f.key === "host")).toBe(true);
    expect(getCredentialTypeDef("smtp").fields.some((f) => f.key === "password")).toBe(true);
    expect(getCredentialTypeDef("openAiApi").fields.some((f) => f.key === "apiKey")).toBe(true);
  });

  it("buildCredentialData parses JSON headers", () => {
    const data = buildCredentialData("httpMultipleHeadersAuth", {
      headers: '{"X-Key":"abc"}',
    });
    expect(data.headers).toEqual({ "X-Key": "abc" });
  });

  it("buildCredentialData coerces ftp port", () => {
    const data = buildCredentialData("ftp", {
      host: "h",
      port: "21",
      username: "u",
      password: "p",
    });
    expect(data.port).toBe(21);
    expect(data.host).toBe("h");
  });
});
