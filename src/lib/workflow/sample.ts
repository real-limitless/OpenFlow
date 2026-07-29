/** A public-shape sample workflow used for the "Start from example" action. */
export const SAMPLE_WORKFLOW = {
  name: "Daily API digest",
  nodes: [
    {
      id: "sample-1",
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [-160, 0],
      parameters: { field: "hours", intervalSize: 6 },
    },
    {
      id: "sample-2",
      name: "HTTP Request",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [80, 0],
      parameters: {
        method: "GET",
        url: "https://api.github.com/repos/xyflow/xyflow",
        authentication: "none",
        options: {},
      },
    },
    {
      id: "sample-3",
      name: "IF",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [320, 0],
      parameters: {
        combinator: "and",
        conditions: {
          conditions: [{ leftValue: "={{ $json.stargazers_count }}", operator: "gt", rightValue: "1000" }],
        },
        options: {},
      },
    },
    {
      id: "sample-4",
      name: "Edit Fields",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [580, -90],
      parameters: {
        mode: "manual",
        includeOtherFields: false,
        fields: {
          values: [
            { name: "headline", type: "stringValue", value: "={{ $json.full_name }} has {{ $json.stargazers_count }} stars" },
          ],
        },
        options: {},
      },
    },
    {
      id: "sample-5",
      name: "No Operation",
      type: "n8n-nodes-base.noOp",
      typeVersion: 1,
      position: [580, 100],
      parameters: {},
    },
  ],
  connections: {
    "Schedule Trigger": { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
    "HTTP Request": { main: [[{ node: "IF", type: "main", index: 0 }]] },
    IF: {
      main: [
        [{ node: "Edit Fields", type: "main", index: 0 }],
        [{ node: "No Operation", type: "main", index: 0 }],
      ],
    },
  },
  active: false,
  settings: { executionOrder: "v1" },
  pinData: {},
};
