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
  | "assignmentCollection";

export interface IDisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
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
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: NodePropertyType;
  default: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
  options?: INodePropertyOption[] | INodePropertyCollectionEntry[] | INodeProperties[];
  displayOptions?: IDisplayOptions;
  typeOptions?: {
    multipleValues?: boolean;
    rows?: number;
    minValue?: number;
    maxValue?: number;
    numberPrecision?: number;
    editor?: "code" | "json";
    password?: boolean;
    /** For resourceLocator: which resource list to load (e.g. dataTable). */
    resource?: "dataTable" | "workflow" | string;
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
  | "ai";

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
  | "Miscellaneous";

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
  credentials?: Array<{ name: string; required?: boolean }>;
  properties: INodeProperties[];
  /** Lucide icon name used by the canvas + palette. */
  icon: string;
  /** Public documentation URLs this clean-room implementation was written from. */
  sources: string[];
  /** Marks placeholder nodes created for unsupported imported types. */
  placeholder?: boolean;
}

export interface NodeType {
  description: INodeTypeDescription;
}

export function resolveOutputs(
  description: INodeTypeDescription,
  parameters: Record<string, unknown>,
): string[] {
  if (description.dynamicOutputs) return description.dynamicOutputs(parameters);
  return description.outputs;
}

export function resolveInputs(
  description: INodeTypeDescription,
  parameters: Record<string, unknown>,
): string[] {
  if (description.dynamicInputs) return description.dynamicInputs(parameters);
  return description.inputs;
}
