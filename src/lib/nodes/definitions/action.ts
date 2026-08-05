import type { INodeTypeDescription } from "../types";

const CORE = "https://docs.n8n.io/integrations/builtin/core-nodes/";

export const webSearch: INodeTypeDescription = {
  name: "n8n-nodes-base.webSearch",
  displayName: "Web Search",
  category: "Actions",
  group: ["action"],
  version: 1,
  description: "Search the web for information",
  defaults: { name: "Web Search" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Search",
  sources: [],
  properties: [
    {
      displayName: "Query",
      name: "query",
      type: "string",
      default: "",
      required: true,
      description: "The search query text. Accepts expressions.",
    },
    {
      displayName: "Result Limit",
      name: "resultLimit",
      type: "number",
      default: 10,
      description: "Maximum number of search results to return",
    },
    {
      displayName: "Search Engine",
      name: "searchEngine",
      type: "options",
      default: "google",
      options: [
        { name: "Google", value: "google" },
        { name: "Bing", value: "bing" },
        { name: "DuckDuckGo", value: "duckduckgo" },
        { name: "Custom", value: "custom" },
      ],
      description: "Which search provider to use",
    },
    {
      displayName: "Custom Endpoint",
      name: "customEndpoint",
      type: "string",
      default: "",
      displayOptions: { show: { searchEngine: ["custom"] } },
      description: "Base URL for a custom search API (only used when search engine is custom)",
    },
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      default: "",
      typeOptions: { password: true },
      description: "API key for the chosen or custom search provider",
    },
    {
      displayName: "Additional Options",
      name: "additionalOptions",
      type: "json",
      default: "{}",
      description: "Free-form JSON for provider-specific options",
    },
  ],
};
