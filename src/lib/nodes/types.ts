/**
 * Clean-room node description model.
 * Property types are taken from the PUBLIC "create a node" documentation on
 * docs.n8n.io (which enumerates the parameter type names and displayOptions).
 * No third-party source code was consulted.
 */

export type NodePropertyType =
  | "string"
  | "number"
  | "boolean"
  | "options"
  | "multiOptions"
  | "collection"
  | "fixedCollection"
  | "dateTime"
  | "json"
  | "resourceLocator"
  | "resourceMapper"
  | "workflowSelect"
  | "notice"
  | "color"
  /** Carried on the node but never rendered — see ParameterField's `hidden` case. */
  | "hidden"
  | "credentials"
  | "credentialsSelector"
  | "assignmentCollection"
  | "fixed"
  | "multiString";

export interface IDisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
  /**
   * A few catalogs place `operation` beside `show`/`hide`. Matching still
   * reads only `show` and `hide`; the field is typed so those objects compile.
   */
  operation?: Array<string | number | boolean>;
}

/** Whether a property/credential should render given current parameter values. */
export function matchesDisplayOptions(
  opts: IDisplayOptions | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!opts) return true;
  const matches = (rules: Record<string, Array<string | number | boolean>>) =>
    Object.entries(rules).every(([key, allowed]) =>
      allowed.some((v) => String(values[key]) === String(v)),
    );
  if (opts.show && !matches(opts.show)) return false;
  if (opts.hide && matches(opts.hide)) return false;
  return true;
}

export interface INodePropertyOption {
  name: string;
  value: string | number | boolean;
  description?: string;
  /** Verb shown in the actions list, e.g. "Convert to CSV". */
  action?: string;
}

export interface INodePropertyCollectionEntry {
  name: string;
  displayName: string;
  values: INodeProperties[];
  /** Present when a collection row is itself a property, not only a group. */
  type?: string;
  value?: string | number | boolean;
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: NodePropertyType;
  /** Omitted on notice/hidden fields and some nested collection rows. */
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
  options?: INodePropertyOption[] | INodePropertyCollectionEntry[] | INodeProperties[];
  displayOptions?: IDisplayOptions;
  /** Collection editor modes carried by some node descriptions. */
  modes?: unknown;
  typeOptions?: {
    multipleValues?: boolean;
    rows?: number;
    minValue?: number;
    maxValue?: number;
    numberPrecision?: number;
    numberStep?: number;
    editor?: "code" | "json" | "sqlEditor";
    password?: boolean;
    /** For resourceLocator: which resource list to load (e.g. dataTable). */
    resource?: "dataTable" | "workflow" | string;
    loadOptionsMethod?: string;
    loadOptions?: unknown;
    searchListMethod?: string;
    alwaysOpenEditWindow?: boolean;
    alwaysOpenEditNode?: boolean;
    multiValueOptions?: unknown;
    inputFieldMaxLength?: number;
    language?: string;
    [key: string]: unknown;
  };
}

export type NodeGroup =
  | "trigger"
  | "input"
  | "output"
  | "transform"
  | "organization"
  | "integration"
  | "communication"
  | "storage"
  | "marketing"
  | "data"
  | "app"
  | "ai"
  | "action"
  | "sales"
  | "core"
  | "data-extraction";

/**
 * Palette grouping key. Every value here must also appear in NODE_CATEGORIES
 * (registry.ts) — that array is what NodePalette iterates to build its groups,
 * so a category missing from it renders no group and its nodes become
 * unreachable in the palette, search included.
 */
export type NodeCategory =
  | "Triggers"
  | "Actions"
  | "Flow"
  | "Transform"
  | "Helpers"
  | "Canvas"
  | "AI"
  | "AI Tool"
  | "Communication"
  | "Data & Storage"
  | "Database"
  | "Development"
  | "Productivity"
  | "Files"
  | "Marketing"
  | "Sales"
  | "CRM"
  | "Finance & Accounting"
  | "Payments"
  | "Analytics"
  | "App"
  | "Core"
  | "Utility"
  | "Miscellaneous"
  | "Action"
  | "Integration"
  | "Input"
  | "Finance"
  | "Commerce"
  | "Core Nodes"
  | "Data & Content"
  | "Marketing & Sales"
  | "Development, Developer Tools"
  | "Development, Data & Storage"
  | "Development, Productivity";

export interface INodeTypeDescription {
  /** Fully-qualified type key, matching the public workflow JSON type string. */
  name: string;
  displayName: string;
  category: NodeCategory;
  group: NodeGroup[];
  version: number | number[];
  defaultVersion?: number;
  description: string;
  defaults: { name: string; color?: string };
  /** Input channel names, usually ["main"]. */
  inputs: string[];
  /** Output channel labels. Length defines the number of output handles. */
  outputs: string[];
  /** Display labels for input handles (parallel to resolved inputs). */
  inputNames?: string[];
  /** Display labels for output handles (e.g. true/false on IF). */
  outputNames?: string[];
  /** Number of outputs is dynamic (e.g. Switch) — derived from parameters. */
  dynamicOutputs?: (parameters: Record<string, unknown>) => string[];
  dynamicInputs?: (parameters: Record<string, unknown>) => string[];
  credentials?: Array<{
    name: string;
    required?: boolean;
    displayName?: string;
    testedBy?: string | { request?: { method?: string; url?: string } };
    displayOptions?: IDisplayOptions;
  }>;
  properties: INodeProperties[];
  /** Lucide icon name used by the canvas + palette. */
  icon: string;
  /** Public documentation URLs this clean-room implementation was written from. */
  sources?: Array<string | { url: string; name?: string }>;
  /** Editor hint. Ignored by execution. */
  parameterPane?: string;
  /** Marks placeholder nodes created for unsupported imported types. */
  placeholder?: boolean;
  /** Hide the node from the palette while keeping the description registered. */
  hidden?: boolean;
  deprecated?: boolean;
  alias?: string | string[];
  /** Regular node that an agent may invoke as a tool. */
  usableAsTool?: boolean;
}

export interface NodeType {
  description: INodeTypeDescription;
}

export function resolveOutputs(
  description: INodeTypeDescription,
  parameters: Record<string, unknown>,
): string[] {
  if (description.dynamicOutputs) return description.dynamicOutputs(parameters) ?? [];
  return description.outputs ?? [];
}

/** Dedicated AI-agent tool sub-node (cluster tool), not a regular main-chain node. */
export function isAiToolSubnode(description: INodeTypeDescription): boolean {
  if (description.outputs.includes("ai_tool") && !description.outputs.includes("main")) return true;
  if (description.category === "AI Tool") return true;
  const short = description.name.split(".").pop() ?? "";
  if (/Tool$/i.test(short)) return true;
  if (/^tool[A-Z]/.test(short)) return true;
  return false;
}

export function resolveInputs(
  description: INodeTypeDescription,
  parameters: Record<string, unknown>,
): string[] {
  if (description.dynamicInputs) return description.dynamicInputs(parameters) ?? [];
  return description.inputs ?? [];
}
