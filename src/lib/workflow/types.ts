/**
 * Clean-room workflow data model.
 *
 * Shapes are derived exclusively from PUBLIC sources:
 *  - Publicly exported workflow JSON files (GitHub templates, community shares)
 *  - docs.n8n.io public documentation on data structure and expressions
 * No third-party source code was consulted. See docs/clean-room.md.
 *
 * This module must stay free of React / DOM / Node imports so it can be reused
 * unchanged by a server-side execution engine in a later phase.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A single item flowing between nodes. */
export interface IBinaryData {
  data: string;
  mimeType: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: number;
  [key: string]: unknown;
}

export interface INodeExecutionData {
  json: Record<string, unknown>;
  binary?: Record<string, IBinaryData>;
  pairedItem?: { item: number; input?: number } | Array<{ item: number; input?: number }>;
}

/** A connection endpoint as it appears in exported workflow JSON. */
export interface IConnectionTarget {
  node: string;
  /** Channel name on the target node, e.g. "main", "ai_languageModel". */
  type: string;
  index: number;
}

/**
 * connections is keyed by SOURCE NODE NAME, then by output channel,
 * then an array per output index, each holding a list of targets.
 */
export type IConnections = Record<string, Record<string, Array<IConnectionTarget[] | null>>>;

export interface INodeCredentialRef {
  id?: string | null;
  name: string;
}

export interface INode {
  id: string;
  name: string;
  /** Fully-qualified type string, e.g. "n8n-nodes-base.httpRequest". */
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, INodeCredentialRef>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  continueOnFail?: boolean;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  onError?: string;
  webhookId?: string;
  /** Any fields we did not model are preserved verbatim for lossless export. */
  [key: string]: unknown;
}

export interface IWorkflowSettings {
  executionOrder?: string;
  saveManualExecutions?: boolean;
  callerPolicy?: string;
  errorWorkflow?: string;
  timezone?: string;
  [key: string]: unknown;
}

export interface IWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
  settings: IWorkflowSettings;
  staticData?: Json | null;
  pinData?: Record<string, INodeExecutionData[]>;
  versionId?: string;
  tags?: Array<string | { id?: string; name: string }>;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export const EMPTY_WORKFLOW = (id: string, name = "Untitled workflow"): IWorkflow => ({
  id,
  name,
  active: false,
  nodes: [],
  connections: {},
  settings: { executionOrder: "v1" },
  pinData: {},
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
