import type { INodeTypeDescription } from "../types";

const CORE = "https://docs.n8n.io/integrations/builtin/core-nodes/";

export const awsLambda: INodeTypeDescription = {
  name: "n8n-nodes-base.awsLambda",
  displayName: "AWS Lambda",
  category: "Actions",
  group: ["input"],
  version: 1,
  description: "Invokes an AWS Lambda function with the provided payload and parameters.",
  defaults: { name: "AWS Lambda" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "CloudFunction",
  sources: [`${CORE}n8n-nodes-base.awsLambda/`],
  credentials: [{ name: "awsLambdaCredentials", required: true }],
  properties: [
    {
      displayName: "Function Name",
      name: "functionName",
      type: "string",
      default: "",
      required: true,
      description: "AWS Lambda function name",
    },
    {
      displayName: "Region",
      name: "region",
      type: "string",
      default: "",
      required: true,
      description: "AWS region",
    },
    {
      displayName: "Payload",
      name: "payload",
      type: "json",
      default: "{}",
      description: "Input data passed to the Lambda function",
    },
    {
      displayName: "Timeout",
      name: "timeout",
      type: "number",
      default: 30,
      description: "Execution timeout in seconds",
      typeOptions: { minValue: 1 },
    },
  ],
};