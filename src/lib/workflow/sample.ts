/** A public-shape sample workflow used for the "Start from example" / first-run action.
 *  Uses Manual Trigger so Execute works immediately (no schedule wait).
 */
export const SAMPLE_WORKFLOW = {
  name: "Daily API digest",
  nodes: [
    {
      id: "sample-1",
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [-160, 0],
      parameters: {},
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
          conditions: [
            {
              leftValue: "={{ $json.stargazers_count }}",
              operator: "gt",
              rightValue: "1000",
            },
          ],
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
            {
              name: "headline",
              type: "stringValue",
              value:
                "={{ $json.full_name }} has {{ $json.stargazers_count }} stars",
            },
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
    "Manual Trigger": { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
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
