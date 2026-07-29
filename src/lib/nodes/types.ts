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
  | "workflowSelect"
  | "notice"
  | "color";

export interface IDisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
}

export interface INodePropertyOption {
  name: string;
  value: string | number | boolean;
  description?: string;
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
  };
}

export type NodeGroup = "trigger" | "input" | "output" | "transform" | "organization";

export type NodeCategory = "Triggers" | "Actions" | "Flow" | "Transform" | "Helpers";

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
