/** Slim mcp-flow catalog-data types (McpGalleryEntry contract 1.2.0). */

export const MCP_GALLERY_SCHEMA_VERSION = "1.2.0";

export const MCP_CLIENT_NODE_TYPE = "openflow-node-langchain.mcpClientTool";

export type McpGalleryTransport =
  | "streamable-http"
  | "sse"
  | "stdio"
  | "unknown";

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
