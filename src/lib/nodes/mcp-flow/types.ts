/** Slim mcp-flow catalog-data types (McpGalleryEntry contract 1.2.0). */

export const MCP_GALLERY_SCHEMA_VERSION = "1.2.0";

export const MCP_CLIENT_NODE_TYPE = "openflow-node-langchain.mcpClientTool";

export type McpGalleryTransport = "streamable-http" | "sse" | "stdio" | "unknown";

export type McpGalleryIndexRow = {
  id: string;
  title: string;
  summary: string;
  transport: McpGalleryTransport;
  flags?: string[];
  version?: string;
  status?: string;
  endpointUrl?: string;
  hasReadme?: boolean;
  hasToolsPreview?: boolean;
  toolsCount?: number;
  file?: string;
};

export type McpGalleryIndex = {
  schemaVersion?: string;
  storage?: string;
  updatedAt?: string;
  entries: McpGalleryIndexRow[];
};

export type McpGalleryEntry = {
  id: string;
  title: string;
  description: string;
  summary?: string;
  version?: string;
  status?: string;
  transport: McpGalleryTransport;
  endpointUrl?: string;
  provenance?: string;
  flags?: string[];
  sourceUrl?: string;
  homepage?: string;
};

/** Credential type for a user-connected mcp-flow gateway (URL + agent key). */
export const MCP_FLOW_API_CREDENTIAL = "mcpFlowApi";

/** Default stored credential name created from Settings → mcp-flow. */
export const MCP_FLOW_CONNECTION_NAME = "mcp-flow";

export type McpFlowPlacement = "remote" | "central-sandbox" | "edge-sandbox" | "edge-bare" | string;

export type McpFlowBackend = {
  slug: string;
  title: string;
  transport?: string;
  enabled?: boolean;
  placement?: McpFlowPlacement;
  url?: string;
  hasHeaders?: boolean;
  hasEnv?: boolean;
  runsOn?: unknown;
};

export type McpFlowProject = {
  slug: string;
  title?: string;
  backendSlugs?: string[];
};

export type McpFlowToolPreview = {
  name: string;
  description?: string;
  backend?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpFlowConnectionPublic = {
  id: string;
  name: string;
  url: string;
};
