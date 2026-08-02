import type { NodeExecutor } from "@/sdk";
import { perplexityExecutor } from "./perplexity";

/**
 * Tool variant of the Perplexity node. Shares the same executor logic —
 * same API surface (chat, agent, embedding, search resources), same
 * credential, same Perplexity API endpoints.
 *
 * The only difference is the wire-level type string
 * (`n8n-nodes-base.perplexityTool` vs `n8n-nodes-base.perplexity`) so that
 * AI-agent canvases can register it as a callable tool.
 */
export const perplexityToolExecutor: NodeExecutor = perplexityExecutor;
