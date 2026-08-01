import type { INodeTypeDescription } from "../types";

/**
 * Canvas-only debug widgets (like sticky notes). They pan/zoom with the graph,
 * persist in workflow JSON, and do not participate in execution edges.
 */

export const inspectTable: INodeTypeDescription = {
  name: "openflow.inspectTable",
  displayName: "Inspect: Table",
  category: "Canvas",
  group: ["organization"],
  version: 1,
  description:
    "Pin a project data table onto the canvas for live debugging. Not part of execution.",
  defaults: { name: "Inspect: Table" },
  inputs: [],
  outputs: [],
  icon: "Table2",
  sources: [],
  properties: [
    {
      displayName: "Data Table ID",
      name: "tableId",
      type: "string",
      default: "",
      noDataExpression: true,
      description: "Project data table id to preview on the canvas.",
    },
    {
      displayName: "Row Limit",
      name: "limit",
      type: "number",
      default: 20,
      typeOptions: { minValue: 1, maxValue: 200 },
      noDataExpression: true,
    },
    { displayName: "Width", name: "width", type: "number", default: 360, noDataExpression: true },
    { displayName: "Height", name: "height", type: "number", default: 240, noDataExpression: true },
  ],
};

export const inspectMedia: INodeTypeDescription = {
  name: "openflow.inspectMedia",
  displayName: "Inspect: Media",
  category: "Canvas",
  group: ["organization"],
  version: 1,
  description:
    "Preview binary image/video from a node’s last execution output on the canvas. Not part of execution.",
  defaults: { name: "Inspect: Media" },
  inputs: [],
  outputs: [],
  icon: "Image",
  sources: [],
  properties: [
    {
      displayName: "Source Node",
      name: "sourceNode",
      type: "string",
      default: "",
      noDataExpression: true,
      description: "Workflow node name whose run output binary to display.",
    },
    {
      displayName: "Binary Property",
      name: "binaryProperty",
      type: "string",
      default: "data",
      noDataExpression: true,
      description: "Binary property name on the source item (default: data).",
    },
    { displayName: "Width", name: "width", type: "number", default: 320, noDataExpression: true },
    { displayName: "Height", name: "height", type: "number", default: 240, noDataExpression: true },
  ],
};
