import { prisma } from "../db";
import { CERTIFIED_SOURCE_ID } from "../../lib/templates/certified";

type CertifiedSeed = {
  packId: string;
  name: string;
  description: string;
  categories: string[];
  workflow: {
    name: string;
    nodes: Array<Record<string, unknown>>;
    connections: Record<string, unknown>;
    active: boolean;
    settings: Record<string, unknown>;
  };
};

const SEEDS: CertifiedSeed[] = [
  {
    packId: "http-get",
    name: "HTTP GET starter",
    description:
      "## Setup\n\nCertified OpenFlow starter: Manual Trigger → HTTP Request.\n\n- Uses only **Ready** executors\n- Import and hit Execute\n\nSee [OpenFlow](https://github.com/real-limitless/OpenFlow).",
    categories: ["Core", "Certified"],
    workflow: {
      name: "HTTP GET starter",
      active: false,
      settings: { executionOrder: "v1" },
      nodes: [
        {
          id: "manual",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [240, 300],
          parameters: {},
        },
        {
          id: "http",
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 1,
          position: [520, 300],
          parameters: { method: "GET", url: "https://httpbin.org/json" },
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
      },
    },
  },
  {
    packId: "python-code",
    name: "Python Code transform",
    description:
      "Certified starter: Manual Trigger → Code (`language=python` sandboxed subprocess).\n\nUses only Ready executors.",
    categories: ["Transform", "Certified"],
    workflow: {
      name: "Python Code transform",
      active: false,
      settings: { executionOrder: "v1" },
      nodes: [
        {
          id: "manual",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [240, 300],
          parameters: {},
        },
        {
          id: "code",
          name: "Code",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [520, 300],
          parameters: {
            mode: "runOnceForAllItems",
            language: "python",
            pythonCode: 'return [{"json": {"n": len(_items), "certified": True}}]',
          },
        },
      ],
      connections: {
        "Manual Trigger": { main: [[{ node: "Code", type: "main", index: 0 }]] },
      },
    },
  },
];

function nodeTypesOf(wf: CertifiedSeed["workflow"]): string[] {
  return [...new Set(wf.nodes.map((n) => String(n.type)))];
}

export async function ensureCertifiedPack(): Promise<void> {
  for (const seed of SEEDS) {
    const id = `${CERTIFIED_SOURCE_ID}:${seed.packId}`;
    const nodeTypes = nodeTypesOf(seed.workflow);
    const data = {
      sourceId: CERTIFIED_SOURCE_ID,
      sourceName: "OpenFlow Certified",
      packId: seed.packId,
      name: seed.name,
      description: seed.description,
      nodeCount: seed.workflow.nodes.length,
      nodeTypes: JSON.stringify(nodeTypes),
      categories: JSON.stringify(seed.categories),
      workflowJson: JSON.stringify(seed.workflow),
      readyToDemo: true,
      authorName: "OpenFlow",
      views: 1000,
    };
    await prisma.workflowTemplate.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
}
