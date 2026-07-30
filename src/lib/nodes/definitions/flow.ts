import type { INodeTypeDescription } from "../types";

const CORE = "https://docs.n8n.io/integrations/builtin/core-nodes/";

const conditionValues = [
  {
    name: "conditions",
    displayName: "Condition",
    values: [
      { displayName: "Left Value", name: "leftValue", type: "string" as const, default: "" },
      {
        displayName: "Operator",
        name: "operator",
        type: "options" as const,
        default: "equals",
        options: [
          { name: "Is Equal To", value: "equals" },
          { name: "Is Not Equal To", value: "notEquals" },
          { name: "Contains", value: "contains" },
          { name: "Does Not Contain", value: "notContains" },
          { name: "Starts With", value: "startsWith" },
          { name: "Ends With", value: "endsWith" },
          { name: "Is Empty", value: "isEmpty" },
          { name: "Is Not Empty", value: "isNotEmpty" },
          { name: "Larger Than", value: "gt" },
          { name: "Smaller Than", value: "lt" },
          { name: "Is True", value: "isTrue" },
          { name: "Is False", value: "isFalse" },
        ],
      },
      { displayName: "Right Value", name: "rightValue", type: "string" as const, default: "" },
    ],
  },
];

export const ifNode: INodeTypeDescription = {
  name: "n8n-nodes-base.if",
  displayName: "IF",
  category: "Flow",
  group: ["transform"],
  version: 2.2,
  description: "Routes items down a true or false branch.",
  defaults: { name: "IF" },
  inputs: ["main"],
  outputs: ["main", "main"],
  outputNames: ["true", "false"],
  icon: "GitBranch",
  sources: [`${CORE}n8n-nodes-base.if/`],
  properties: [
    {
      displayName: "Conditions",
      name: "conditions",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      options: conditionValues,
    },
    {
      displayName: "Combine",
      name: "combinator",
      type: "options",
      default: "and",
      options: [
        { name: "All conditions must match (AND)", value: "and" },
        { name: "Any condition may match (OR)", value: "or" },
      ],
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        { displayName: "Ignore Case", name: "ignoreCase", type: "boolean", default: true },
        {
          displayName: "Loose Type Validation",
          name: "looseTypeValidation",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const switchNode: INodeTypeDescription = {
  name: "n8n-nodes-base.switch",
  displayName: "Switch",
  category: "Flow",
  group: ["transform"],
  version: 3.2,
  description: "Routes items to one of several outputs based on rules.",
  defaults: { name: "Switch" },
  inputs: ["main"],
  outputs: ["main", "main"],
  icon: "Split",
  sources: [`${CORE}n8n-nodes-base.switch/`],
  dynamicOutputs: (parameters) => {
    const rules = parameters?.rules as { values?: unknown[] } | undefined;
    const count = Math.max(1, rules?.values?.length ?? 2);
    const fallback = parameters?.options as { fallbackOutput?: unknown } | undefined;
    const extra = fallback?.fallbackOutput === "extra" ? 1 : 0;
    return Array.from({ length: count + extra }, () => "main");
  },
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "rules",
      noDataExpression: true,
      options: [
        { name: "Rules", value: "rules" },
        { name: "Expression", value: "expression" },
      ],
    },
    {
      displayName: "Routing Rules",
      name: "rules",
      type: "fixedCollection",
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { mode: ["rules"] } },
      options: [
        {
          name: "values",
          displayName: "Rule",
          values: [
            { displayName: "Left Value", name: "leftValue", type: "string", default: "" },
            {
              displayName: "Operator",
              name: "operator",
              type: "options",
              default: "equals",
              options: [
                { name: "Is Equal To", value: "equals" },
                { name: "Contains", value: "contains" },
                { name: "Larger Than", value: "gt" },
                { name: "Smaller Than", value: "lt" },
              ],
            },
            { displayName: "Right Value", name: "rightValue", type: "string", default: "" },
            { displayName: "Output Name", name: "outputKey", type: "string", default: "" },
          ],
        },
      ],
    },
    {
      displayName: "Output Index Expression",
      name: "output",
      type: "string",
      default: "={{ 0 }}",
      displayOptions: { show: { mode: ["expression"] } },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Fallback Output",
          name: "fallbackOutput",
          type: "options",
          default: "none",
          options: [
            { name: "Discard Item", value: "none" },
            { name: "Extra Output", value: "extra" },
          ],
        },
        {
          displayName: "Send To All Matching Outputs",
          name: "allMatchingOutputs",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const merge: INodeTypeDescription = {
  name: "n8n-nodes-base.merge",
  displayName: "Merge",
  category: "Flow",
  group: ["transform"],
  version: 3,
  description: "Combines items from two or more input branches.",
  defaults: { name: "Merge" },
  inputs: ["main", "main"],
  outputs: ["main"],
  icon: "Merge",
  sources: [`${CORE}n8n-nodes-base.merge/`],
  dynamicInputs: (parameters) => {
    const count = Math.max(2, Number(parameters?.numberInputs ?? 2));
    return Array.from({ length: count }, () => "main");
  },
  properties: [
    {
      displayName: "Mode",
      name: "mode",
      type: "options",
      default: "append",
      noDataExpression: true,
      options: [
        { name: "Append", value: "append" },
        { name: "Combine", value: "combine" },
        { name: "Choose Branch", value: "chooseBranch" },
      ],
    },
    {
      displayName: "Combine By",
      name: "combineBy",
      type: "options",
      default: "combineByFields",
      displayOptions: { show: { mode: ["combine"] } },
      options: [
        { name: "Matching Fields", value: "combineByFields" },
        { name: "Position", value: "combineByPosition" },
        { name: "All Combinations", value: "combineAll" },
      ],
    },
    {
      displayName: "Fields to Match",
      name: "fieldsToMatchString",
      type: "string",
      default: "",
      placeholder: "id, email",
      displayOptions: { show: { mode: ["combine"], combineBy: ["combineByFields"] } },
    },
    {
      displayName: "Number of Inputs",
      name: "numberInputs",
      type: "number",
      default: 2,
      typeOptions: { minValue: 2, maxValue: 10 },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Include Any Unpaired Items",
          name: "includeUnpaired",
          type: "boolean",
          default: false,
        },
      ],
    },
  ],
};

export const splitInBatches: INodeTypeDescription = {
  name: "n8n-nodes-base.splitInBatches",
  displayName: "Loop Over Items",
  category: "Flow",
  group: ["transform"],
  version: 3,
  description:
    "Splits items into batches for iterative processing, looping until all batches are consumed.",
  defaults: { name: "Loop Over Items" },
  inputs: ["main"],
  outputs: ["main", "main"],
  // typeVersion 3: output[0] = done, output[1] = loop (current descriptor order).
  // typeVersion 2 swaps these (loop = 0, done = 1); v1 is single-output (inferred).
  outputNames: ["done", "loop"],
  icon: "Repeat",
  sources: [`${CORE}n8n-nodes-base.splitinbatches/`],
  properties: [
    {
      displayName: "Not all nodes need this node. Many nodes already process each item separately.",
      name: "splitInBatchesNotice",
      type: "notice",
      default: "",
    },
    {
      displayName: "Batch Size",
      name: "batchSize",
      type: "number",
      default: 1,
      required: true,
      typeOptions: { minValue: 1 },
      description: "Number of items to emit on each loop iteration.",
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Reset",
          name: "reset",
          type: "boolean",
          default: false,
          description: "Restart batching from the beginning instead of resuming.",
        },
      ],
    },
  ],
};

export const wait: INodeTypeDescription = {
  name: "n8n-nodes-base.wait",
  displayName: "Wait",
  category: "Actions",
  group: ["organization"],
  version: 1.1,
  description: "Pauses the workflow before continuing.",
  defaults: { name: "Wait" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Hourglass",
  sources: [`${CORE}n8n-nodes-base.wait/`],
  properties: [
    {
      displayName: "Resume",
      name: "resume",
      type: "options",
      default: "timeInterval",
      noDataExpression: true,
      options: [
        { name: "After Time Interval", value: "timeInterval" },
        { name: "At Specified Time", value: "specificTime" },
        { name: "On Webhook Call", value: "webhook" },
      ],
    },
    {
      displayName: "Wait Amount",
      name: "amount",
      type: "number",
      default: 1,
      typeOptions: { minValue: 0 },
      displayOptions: { show: { resume: ["timeInterval"] } },
    },
    {
      displayName: "Wait Unit",
      name: "unit",
      type: "options",
      default: "hours",
      displayOptions: { show: { resume: ["timeInterval"] } },
      options: [
        { name: "Seconds", value: "seconds" },
        { name: "Minutes", value: "minutes" },
        { name: "Hours", value: "hours" },
        { name: "Days", value: "days" },
      ],
    },
    {
      displayName: "Date and Time",
      name: "dateTime",
      type: "dateTime",
      default: "",
      displayOptions: { show: { resume: ["specificTime"] } },
    },
    {
      displayName: "Limit Wait Time",
      name: "limitWaitTime",
      type: "boolean",
      default: false,
      displayOptions: { show: { resume: ["webhook"] } },
    },
  ],
};
